import React, { useState } from "react";
import PageLayout from "./PageLayout";

const ChatClient = () => {
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(false);

    const sendMessage = async () => {
        if (!input.trim()) return;

        const userMessage = { role: "user", content: input };
        setMessages((prevMessages) => [...prevMessages, userMessage]);
        setInput("");
        setLoading(true);

        try {
            const response = await fetch("/api/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ message: input }),
            });

            if (!response.ok) throw new Error("Server error");

            const data = await response.json();

            setMessages((prevMessages) => [
                ...prevMessages,
                { role: "bot", content: data.reply.replace(/\n/g, "<br/>") }
            ]);
        } catch (error) {
            console.error("Error sending message:", error);
            setMessages((prevMessages) => [
                ...prevMessages,
                { role: "bot", content: "Error: Unable to fetch response." }
            ]);
        } finally {
            setLoading(false);
        }

        // Auto-scroll to the bottom after new message
        setTimeout(() => {
            const chatContainer = document.getElementById("chat-container");
            if (chatContainer) {
                chatContainer.scrollTop = chatContainer.scrollHeight;
            }
        }, 100);
    };

    return (
        <PageLayout>
 
            <h1>Ask a Question</h1>
            <div style={{
            maxWidth: "900px",
            margin: "auto",
            padding: "20px",
            marginTop: "5px", // 🛠 Add margin below the menu
            position: "relative", // 🛠 Ensure chat does not overlap with fixed menu
            zIndex: 1 // 🛠 Keep chat above background elements
        }}>
    
            <div 
                id="chat-container"
                style={{
                    border: "1px solid #ccc",
                    padding: "10px",
                    height: "300px",  // Fixed height
                    overflowY: "auto",  // Enable scrolling
                    borderRadius: "10px",
                    background: "#f9f9f9"
                }}
            >
                {messages.map((msg, index) => (
                    <div
                        key={index}
                        style={{
                            textAlign: msg.role === "user" ? "right" : "left",
                            marginBottom: "10px"
                        }}
                    >
                        <div
                            style={{
                                display: "inline-block",
                                padding: "10px",
                                borderRadius: "10px",
                                background: msg.role === "user" ? "#007bff" : "#ddd",
                                color: msg.role === "user" ? "white" : "black",
                                maxWidth: "70%"
                            }}
                        >
                            <strong>{msg.role === "user" ? "You" : "Bot"}:</strong> 
                            <span dangerouslySetInnerHTML={{ __html: msg.content }} />
                        </div>
                    </div>
                ))}

                {/* Typing indicator */}
                {loading && (
                    <div style={{ textAlign: "left", marginTop: "10px", color: "gray" }}>
                        <strong>Bot is typing</strong>
                        <span className="dots">.</span>
                    </div>
                )}
            </div>

            <div style={{ display: "flex", marginTop: "10px" }}>
                <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Type a Quesiton... Ex. Does odoo process credit cards?"
                    rows="3" // 🛠 Allows multiple lines
                    style={{
        flex: 1,
        padding: "15px",
        borderRadius: "5px",
        fontSize: "20px", // 🛠 Increased font size for input field
        border: "1px solid #ccc",
        backgroundColor: "#fff", // ✅ White background
        color: "#000"            // ✅ Black text
    }}
                />
                 <button onClick={sendMessage} style={{
                    padding: "15px",
                    marginTop: "10px",
                    borderRadius: "5px",
                    background: "#007bff",
                    color: "white",
                    fontSize: "24px",
                    border: "none",
                    cursor: "pointer"
                }}>
                    Send
                </button>
            </div>

            {/* CSS for animated typing dots */}
            <style>
                {`
                    .dots {
                        display: inline-block;
                        animation: dots 1.5s infinite;
                    }

                    @keyframes dots {
                        0% { content: "."; }
                        33% { content: ".."; }
                        66% { content: "..."; }
                    }
                `}
            </style>
        </div>

            
         </PageLayout>
    );
};

export default ChatClient;
