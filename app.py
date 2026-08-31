import streamlit as st

from backend.chunker import chunk_text
from backend.file_processor import extract_text
from backend.llm import smart_answer
from backend.vector_store import add_chunks, get_collection

# Set up the page title and a wide layout
st.set_page_config(page_title="DocChat", layout="wide")

# Remember the vector store, chat history, and which files were already ingested
if "collection" not in st.session_state:
    st.session_state.collection = None
if "messages" not in st.session_state:
    st.session_state.messages = []
if "processed_files" not in st.session_state:
    st.session_state.processed_files = set()
if st.session_state.collection is None:
    st.session_state.collection = get_collection()

# Sidebar where the user uploads documents
with st.sidebar:
    st.header("Upload Documents")
    uploaded_files = st.file_uploader(
        "Choose files",
        type=["pdf", "docx", "txt"],
        accept_multiple_files=True,
    )

    if st.session_state.processed_files:
        st.subheader("Loaded Files:")
        for filename in st.session_state.processed_files:
            st.write(f"📄 {filename}")

    # Process each new upload: extract text, split it, then store the chunks
    if uploaded_files:
        for uploaded_file in uploaded_files:
            if uploaded_file.name in st.session_state.processed_files:
                continue
            try:
                with st.spinner(f"Processing {uploaded_file.name}..."):
                    text = extract_text(uploaded_file)
                    chunks = chunk_text(text, uploaded_file.name)
                    add_chunks(st.session_state.collection, chunks)
                st.session_state.processed_files.add(uploaded_file.name)
                st.success(f"{uploaded_file.name} — {len(chunks)} chunks")
            except Exception as error:
                st.error(str(error))

# Main chat area
st.title("💬 DocChat")
st.caption("Ask questions — answers come only from your uploaded documents.")
st.divider()

# Show previous chat messages
for message in st.session_state.messages:
    with st.chat_message(message["role"]):
        st.write(message["content"])

# Handle a new question from the user
prompt = st.chat_input("Ask about your documents...")
if prompt:
    if not st.session_state.processed_files:
        st.info("Please upload documents first.")
        st.stop()

    st.session_state.messages.append({"role": "user", "content": prompt})
    with st.chat_message("user"):
        st.write(prompt)

    with st.chat_message("assistant"):
        with st.spinner("Thinking..."):
            answer, _results, _best_sim = smart_answer(
                st.session_state.collection, prompt
            )
        st.write(answer)
    st.session_state.messages.append({"role": "assistant", "content": answer})
