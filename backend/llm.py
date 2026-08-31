import os

from dotenv import load_dotenv
from groq import Groq

# Load GROQ_API_KEY from the .env file
load_dotenv()

# One Groq client for the whole module
client = Groq(api_key=os.getenv("GROQ_API_KEY"))

# Exact reply when the documents do not contain the answer
REFUSAL = "I do not have this information in the provided documents."

# Rules the model must follow when it writes an answer
SYSTEM_PROMPT = (
    "Answer ONLY using the provided CONTEXT. "
    f'If the answer is not in CONTEXT, respond with the exact phrase: "{REFUSAL}" '
    "Do not use outside knowledge. "
    "Do not guess."
)


def generate_answer(question: str, chunks: list[str]) -> str:
    # Glue the retrieved chunks into one context block
    context = "\n\n---\n\n".join(chunks)

    # Ask Groq to answer using only that context
    response = client.chat.completions.create(
        model="llama3-8b-8192",
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {
                "role": "user",
                "content": f"CONTEXT:\n{context}\n\nQUESTION: {question}",
            },
        ],
        max_tokens=512,
        temperature=0.1,
    )
    return response.choices[0].message.content


def smart_answer(collection, question: str):
    # Search the vector store for chunks related to the question
    from backend.vector_store import query_collection

    results = query_collection(collection, question, top_k=5)

    # Score how close the best match is (higher means more similar)
    distances = results["distances"][0] if results.get("distances") else []
    min_distance = min(distances) if distances else 2.0
    best_sim = 1 - (min_distance / 2)

    # If nothing is similar enough, refuse instead of guessing
    if best_sim < 0.10:
        return REFUSAL, results, best_sim

    # Use the retrieved documents to write an answer
    documents = results["documents"][0] if results.get("documents") else []
    answer = generate_answer(question, documents)
    return answer, results, best_sim
