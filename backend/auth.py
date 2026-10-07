"""DocChat Authentication & User Management Module.

Provides secure user authentication, PBKDF2 password hashing with salt,
SQLite-backed persistent user credentials, tenant isolation mapping,
strict password complexity enforcement, and automated session expiry cleanup.
"""

import hashlib
import logging
import os
import re
import secrets
import sqlite3
import time
from typing import Any, Dict, Optional, Tuple

logger = logging.getLogger(__name__)

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "users.db")


def _get_connection() -> sqlite3.Connection:
    """Acquire SQLite connection with WAL mode and resilient busy timeout."""
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=30.0)
    conn.row_factory = sqlite3.Row
    # Enable WAL mode for high concurrency without locks
    try:
        conn.execute("PRAGMA journal_mode = WAL;")
        conn.execute("PRAGMA busy_timeout = 5000;")
    except Exception as e:
        logger.debug("Failed to set PRAGMA journal_mode: %s", e)
    return conn


def cleanup_expired_sessions() -> int:
    """Purge expired session tokens from the database."""
    now = time.time()
    try:
        with _get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM sessions WHERE expires_at <= ?", (now,))
            deleted = cursor.rowcount
            conn.commit()
            if deleted > 0:
                logger.debug("Cleaned up %d expired sessions.", deleted)
            return deleted
    except Exception as e:
        logger.warning("Session cleanup error: %s", e)
        return 0


def init_auth_db() -> None:
    """Initialize the authentication SQLite database schema and handle safe seeding."""
    with _get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL COLLATE NOCASE,
                email TEXT UNIQUE NOT NULL COLLATE NOCASE,
                password_hash TEXT NOT NULL,
                salt TEXT NOT NULL,
                role TEXT DEFAULT 'user',
                created_at REAL NOT NULL,
                last_login REAL
            )
            """
        )
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS sessions (
                token TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL,
                created_at REAL NOT NULL,
                expires_at REAL NOT NULL,
                FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            )
            """
        )
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)")
        conn.commit()

        # Only seed demo/admin users if explicitly enabled via environment variable
        allow_seeding = os.getenv("ALLOW_DEMO_SEEDING", "false").strip().lower() in ("true", "1", "yes")
        if allow_seeding:
            cursor.execute("SELECT COUNT(*) as cnt FROM users")
            count = cursor.fetchone()["cnt"]
            if count == 0:
                demo_pwd = os.getenv("SEED_DEMO_PASSWORD") or secrets.token_urlsafe(16)
                admin_pwd = os.getenv("SEED_ADMIN_PASSWORD") or secrets.token_urlsafe(16)
                _seed_user(conn, "demo", "demo@docchat.ai", demo_pwd, role="member")
                _seed_user(conn, "admin", "admin@docchat.ai", admin_pwd, role="admin")
                logger.info(
                    "Seeded initial demo accounts (ALLOW_DEMO_SEEDING=true). "
                    "Demo password: %s | Admin password: %s",
                    demo_pwd if not os.getenv("SEED_DEMO_PASSWORD") else "[PROTECTED]",
                    admin_pwd if not os.getenv("SEED_ADMIN_PASSWORD") else "[PROTECTED]",
                )


def _hash_password(password: str, salt: Optional[str] = None) -> Tuple[str, str]:
    """Generate PBKDF2-HMAC-SHA256 hash with random 16-byte hex salt."""
    if not salt:
        salt = secrets.token_hex(16)
    key = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt.encode("utf-8"),
        iterations=100_000,
    )
    return key.hex(), salt


def _verify_password(password: str, password_hash: str, salt: str) -> bool:
    """Constant-time password verification using PBKDF2."""
    computed_hash, _ = _hash_password(password, salt)
    return secrets.compare_digest(computed_hash, password_hash)


def _seed_user(conn: sqlite3.Connection, username: str, email: str, password: str, role: str = "user") -> None:
    pwd_hash, salt = _hash_password(password)
    now = time.time()
    conn.cursor().execute(
        """
        INSERT OR IGNORE INTO users (username, email, password_hash, salt, role, created_at, last_login)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (username, email, pwd_hash, salt, role, now, now),
    )
    conn.commit()


def validate_password_complexity(password: str) -> Tuple[bool, str]:
    """Enforce industry standard password complexity requirements (min 12 chars, upper, lower, digit, symbol)."""
    if not password or len(password) < 12:
        return False, "Password must be at least 12 characters long."
    if not re.search(r"[A-Z]", password):
        return False, "Password must contain at least one uppercase letter (A-Z)."
    if not re.search(r"[a-z]", password):
        return False, "Password must contain at least one lowercase letter (a-z)."
    if not re.search(r"\d", password):
        return False, "Password must contain at least one number (0-9)."
    if not re.search(r"[!@#$%^&*(),.?\":{}|<>\-_+=\[\]]", password):
        return False, "Password must contain at least one special character (!@#$%^&* etc.)."
    return True, ""


def register_user(username: str, email: str, password: str, role: str = "user") -> Tuple[bool, str, Optional[Dict[str, Any]]]:
    """Register a new user account with strict complexity validation."""
    username = username.strip()
    email = email.strip().lower()

    if not username or len(username) < 3 or len(username) > 32:
        return False, "Username must be between 3 and 32 characters long.", None

    if not re.match(r"^[a-zA-Z0-9_\-\.]+$", username):
        return False, "Username can only contain alphanumeric characters, underscores, hyphens, and periods.", None

    if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", email):
        return False, "Please enter a valid email address.", None

    valid, err_msg = validate_password_complexity(password)
    if not valid:
        return False, err_msg, None

    init_auth_db()
    pwd_hash, salt = _hash_password(password)
    now = time.time()

    try:
        with _get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                INSERT INTO users (username, email, password_hash, salt, role, created_at, last_login)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (username, email, pwd_hash, salt, role, now, now),
            )
            user_id = cursor.lastrowid
            conn.commit()
            return True, "Account created successfully!", {
                "id": user_id,
                "username": username,
                "email": email,
                "role": role,
            }
    except sqlite3.IntegrityError as e:
        err_str = str(e).lower()
        if "username" in err_str:
            return False, "Username is already taken. Please choose another.", None
        elif "email" in err_str:
            return False, "An account with this email already exists.", None
        return False, "User with these details already exists.", None
    except Exception as exc:
        logger.error("Registration error: %s", exc)
        return False, "Registration could not be completed. Please try again later.", None


def authenticate_user(username_or_email: str, password: str) -> Tuple[bool, str, Optional[Dict[str, Any]]]:
    """Authenticate a user via username or email without user enumeration leakage."""
    query_str = (username_or_email or "").strip()
    clean_pwd = password or ""

    if not query_str or not clean_pwd:
        return False, "Please enter both username/email and password.", None

    init_auth_db()
    # Dummy hash to perform timing-safe calculation even on missing user
    dummy_hash, dummy_salt = _hash_password("dummy_password_for_timing_safety")

    try:
        with _get_connection() as conn:
            cursor = conn.cursor()
            query_lower = query_str.lower()
            query_nospaces = query_lower.replace(" ", "")

            cursor.execute(
                """
                SELECT id, username, email, password_hash, salt, role
                FROM users
                WHERE LOWER(TRIM(username)) = ?
                   OR LOWER(TRIM(email)) = ?
                   OR LOWER(REPLACE(username, ' ', '')) = ?
                   OR LOWER(REPLACE(email, ' ', '')) = ?
                ORDER BY id ASC
                """,
                (query_lower, query_lower, query_nospaces, query_nospaces),
            )
            rows = cursor.fetchall()
            if not rows:
                # Perform dummy verification to mitigate timing analysis
                _verify_password(clean_pwd, dummy_hash, dummy_salt)
                return False, "Invalid username/email or password.", None

            # Verify password against matching user account(s)
            matched_row = None
            for row in rows:
                if _verify_password(clean_pwd, row["password_hash"], row["salt"]):
                    matched_row = row
                    break

            if not matched_row:
                return False, "Invalid username/email or password.", None

            # Update last login timestamp
            cursor.execute(
                "UPDATE users SET last_login = ? WHERE id = ?",
                (time.time(), matched_row["id"]),
            )
            conn.commit()

            return True, "Authentication successful!", {
                "id": matched_row["id"],
                "username": matched_row["username"],
                "email": matched_row["email"],
                "role": matched_row["role"],
            }
    except Exception as exc:
        logger.error("Authentication exception: %s", exc)
        return False, "Authentication service error. Please try again.", None


def get_user_by_id(user_id: int) -> Optional[Dict[str, Any]]:
    """Fetch user profile details by ID."""
    init_auth_db()
    try:
        with _get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT id, username, email, role, created_at, last_login FROM users WHERE id = ?",
                (user_id,),
            )
            row = cursor.fetchone()
            if row:
                return dict(row)
            return None
    except Exception as e:
        logger.error("get_user_by_id error: %s", e)
        return None


def update_user_password(username_or_email: str, new_password: str) -> Tuple[bool, str]:
    """Reset or update a user's password with complexity validation."""
    query_str = (username_or_email or "").strip()
    valid, err_msg = validate_password_complexity(new_password)
    if not valid:
        return False, err_msg

    init_auth_db()
    pwd_hash, salt = _hash_password(new_password)
    try:
        with _get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                UPDATE users
                SET password_hash = ?, salt = ?
                WHERE LOWER(TRIM(username)) = LOWER(?) OR LOWER(TRIM(email)) = LOWER(?)
                """,
                (pwd_hash, salt, query_str, query_str),
            )
            if cursor.rowcount > 0:
                conn.commit()
                return True, "Password updated successfully!"
            return False, "User account not found."
    except Exception as exc:
        logger.error("Password update error: %s", exc)
        return False, "Password update failed. Please try again."


def create_user_session(user_id: int, duration_days: int = 7) -> str:
    """Create a cryptographically random session token valid for duration_days with auto-cleanup."""
    init_auth_db()
    cleanup_expired_sessions()

    token = secrets.token_hex(32)
    now = time.time()
    expires_at = now + (duration_days * 86400)

    with _get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO sessions (token, user_id, created_at, expires_at)
            VALUES (?, ?, ?, ?)
            """,
            (token, user_id, now, expires_at),
        )
        conn.commit()
    return token


def get_user_from_session(token: str) -> Optional[Dict[str, Any]]:
    """Retrieve and validate user from persistent session token, enforcing expiry."""
    if not token or not isinstance(token, str):
        return None

    init_auth_db()
    cleanup_expired_sessions()

    try:
        with _get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                SELECT u.id, u.username, u.email, u.role
                FROM sessions s
                JOIN users u ON s.user_id = u.id
                WHERE s.token = ? AND s.expires_at > ?
                """,
                (token.strip(), time.time()),
            )
            row = cursor.fetchone()
            if row:
                return dict(row)
            return None
    except Exception as e:
        logger.error("get_user_from_session error: %s", e)
        return None


def revoke_user_session(token: str) -> None:
    """Revoke/delete an active session token upon explicit logout."""
    if not token or not isinstance(token, str):
        return
    try:
        with _get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM sessions WHERE token = ?", (token.strip(),))
            conn.commit()
    except Exception as e:
        logger.error("revoke_user_session error: %s", e)
