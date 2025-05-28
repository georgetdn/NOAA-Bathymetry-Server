import React, { useState } from "react";
import PageLayout from "./PageLayout";

const ContactPage = () => {
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [message, setMessage] = useState("");
    const [status, setStatus] = useState("");

    const handleSubmit = async (e) => {
        e.preventDefault();

        // Check if all fields are filled
        if (!name || !email || !message) {
            setStatus("❌ All fields are required.");
            return;
        }

        try {
            console.log("Sending request to /send-email with data:", { name, email, message });

            // ✅ Send form data to the Express backend
            const response = await fetch("/send-email", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ name, email, message }),
            });

            const result = await response.json();

            if (response.ok) {
                console.log("Response from server:", result);
                setStatus("✅ Message sent successfully!");
                setName("");
                setEmail("");
                setMessage("");
            } else {
                console.error("Error response from server:", result);
                setStatus(`❌ Error: ${result.message}`);
            }
        } catch (error) {
            console.error("❌ Failed to send message:", error);
            setStatus("❌ Server error. Please try again later.");
        }
    };

    return (
        <PageLayout>
            <div className="contact-content">
                <h1>Contact Us</h1>

                {/* Contact Details */}
                <div className="contact-info">
                    <p>Call us at   <strong><a href="tel:7035687739">703-568-7739 </a></strong>
                    - Email us at <a href="mailto:info@y219.com">info@y219.com</a> <br/><br/><br/><br/><br/><br/>
                    Or fill out the form below.
                </p>
                </div>

                {/* Contact Form */}
                <form onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label htmlFor="name">Name:</label>
                        <input
                            id="name"
                            type="text"
                            placeholder="Enter your name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            required
                        />
                    </div>

                    <div className="form-group">
                        <label htmlFor="email">Email:</label>
                        <input
                            id="email"
                            type="email"
                            placeholder="Enter your email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                        />
                    </div>

                    <div className="form-group">
                        <label htmlFor="message">Message:</label>
                        <textarea
                            id="message"
                            placeholder="Enter your message"
                            rows="4"
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                            required
                        ></textarea>
                    </div>

                    <button type="submit">Send Message</button>
                </form>

                {/* Display status messages */}
                {status && <p className="status-message">{status}</p>}
            </div>
        </PageLayout>
    );
};

export default ContactPage;
