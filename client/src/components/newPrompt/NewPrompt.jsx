import { useEffect, useRef, useState } from "react";
import "./newPrompt.css";
import Upload from "../upload/Upload";
import { IKImage } from "imagekitio-react";
import model from "../../lib/gemini"; // Assuming Gemini AI model is initialized here
import Markdown from "react-markdown";
import { useMutation, useQueryClient } from "@tanstack/react-query";

const NewPrompt = ({ data }) => {
  const [question, setQuestion] = useState("");
  console.log("🚀 ~ NewPrompt ~ question:", question)
  const [answer, setAnswer] = useState("");
  console.log("🚀 ~ NewPrompt ~ answer:", answer)
  const [editingIndex, setEditingIndex] = useState(null); // Track which message is being edited
  const [branches, setBranches] = useState([]); // Store branches
  const [img, setImg] = useState({
    isLoading: false,
    error: "",
    dbData: {},
    aiData: {},
  });

  const endRef = useRef(null);
  const formRef = useRef(null);
  const queryClient = useQueryClient();

  // Initialize Gemini AI chat with history from data
  const chat = model.startChat({
    history:
      data?.history.map(({ role, parts }) => ({
        role,
        parts: [{ text: parts[0].text }],
      })) || [],
    generationConfig: {},
  });

  // Fetch branches when the component loads
  useEffect(() => {
    const fetchBranches = async () => {
      try {
        const response = await fetch(`${import.meta.env.VITE_API_URL}/api/chats/${data._id}/branches`, {
          credentials: "include",
        });
        const result = await response.json();
        setBranches(result);
      } catch (err) {
        console.error("Error fetching branches:", err);
      }
    };

    fetchBranches();
  }, [data._id]);

  useEffect(() => {
    endRef.current.scrollIntoView({ behavior: "smooth" });
  }, [data, question, answer, img.dbData, branches]);

  const mutation = useMutation({
    mutationFn: (newBranch) => {
      return fetch(`${import.meta.env.VITE_API_URL}/api/chats/${data._id}/branch`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(newBranch),
      }).then((res) => res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chat", data._id] }).then(() => {
        formRef.current.reset();
        // setQuestion("");
        // setAnswer("");
        setImg({
          isLoading: false,
          error: "",
          dbData: {},
          aiData: {},
        });
        setEditingIndex(null);
      });
    },
    onError: (err) => {
      console.log("Error creating branch:", err);
    },
  });

  const createBranch = async (editedText, messageIndex) => {
    console.log("🚀 ~ createBranch ~ editedText:", editedText)
    try {
      // Generate new AI response for the edited message using Gemini AI
      const result = await chat.sendMessage([{ text: editedText }]);
      console.log("🚀 ~ createBranch ~ result:", result)
      // let accumulatedText = "";
      // for await (const chunk of result.stream) {
      //   const chunkText = chunk.text();
      //   accumulatedText += chunkText;
      //   setAnswer(accumulatedText); // Show the AI response in real-time
      // }
      const aiResponse = result.response.candidates[0].content.parts[0].text;
      console.log("🚀 ~ createBranch ~ aiResponse:", aiResponse)
      setAnswer(aiResponse);
      // Save the branch with edited message and AI response
      mutation.mutate({
        messageIndex,
        editedText,
        aiResponse: aiResponse,
      });
    } catch (err) {
      console.error("Error generating AI response:", err);
    }
  };

  const handleEdit = (index) => {
    setEditingIndex(index);
    setQuestion(data.history[index].parts[0].text); // Pre-fill input with message text
  };

  const handleBranch = (e) => {
    e.preventDefault();

    const editedText = e.target.text.value;
    if (!editedText) return;

    createBranch(editedText, editingIndex);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const text = e.target.text.value;
    if (!text) return;

    add(text, false);
  };

  const add = async (text, isInitial) => {

    setQuestion(text);
    try {
      const result = await chat.sendMessage([text]);
      const aiResponse = await result.response.candidates[0].content.parts[0].text;
      console.log("🚀 ~ createBranch ~ aiResponse:", aiResponse)
      setAnswer(aiResponse);

      mutation.mutate({
        question: question.length ? question : undefined,
        answer: aiResponse,
        img: img.dbData?.filePath || undefined,
      });
    } catch (err) {
      console.error("Error adding new message:", err);
    }
  };

  return (
    <>
      {/* Chat Messages */}
      {img.isLoading && <div className="">Loading...</div>}
      {img.dbData?.filePath && (
        <IKImage
          urlEndpoint={import.meta.env.VITE_IMAGE_KIT_ENDPOINT}
          path={img.dbData?.filePath}
          width="380"
          transformation={[{ width: 380 }]}
        />
      )}
      {data.history.map((msg, index) => (
        <div
          key={index}
          className={`message ${msg.role === "user" ? "user" : ""}`}
          onClick={() => handleEdit(index)} // Enable click to edit
        >
          {editingIndex === index ? (
            <form onSubmit={handleBranch}>
              <input
                type="text"
                name="text"
                defaultValue={msg.parts[0].text}
                autoFocus
              />
              <button type="submit">Save as Branch</button>
              <button type="button" onClick={() => setEditingIndex(null)}>
                Cancel
              </button>
            </form>
          ) : (
            <Markdown>{msg.parts[0].text}</Markdown>
          )}
        </div>
      ))}

      {/* Display Branches */}
      {branches.length > 0 && (
        <div className="branches">
          <h3>Branches</h3>
          {branches.map((branch, index) => (
            <div key={index} className="branch">
              <h4>Branch {index + 1}</h4>
              {branch.branchHistory.map((msg, idx) => (
                <div
                  key={idx}
                  className={`message ${msg.role === "user" ? "user" : "model"}`}
                >
                  <Markdown>{msg.parts[0].text}</Markdown>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

{question && <div className="message user">{question}</div>}
      {answer && (
        <div className="message">
          <Markdown>{answer}</Markdown>
        </div>
      )}


      <div className="endChat" ref={endRef}></div>

      {/* New Message Form */}
      <form
        className="newForm"
        onSubmit={editingIndex === null ? handleSubmit : handleBranch}
        ref={formRef}
      >
        <Upload setImg={setImg} />
        <input id="file" type="file" multiple={false} hidden />
        <input
          type="text"
          name="text"
          placeholder="Ask anything..."
          defaultValue={editingIndex !== null ? question : ""}
        />
        <button>
          <img src="/arrow.png" alt="" />
        </button>
      </form>
    </>
  );
};

export default NewPrompt;