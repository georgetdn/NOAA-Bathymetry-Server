const express = require("express");
const path = require("path");
const cors = require("cors");
const nodemailer = require("nodemailer");
const OpenAI = require("openai"); // ✅ Use OpenAI directly

require("dotenv").config();

const app = express();

app.use(cors());
app.use(express.json());


// ✅ Correct way to initialize OpenAI
const openai = new OpenAI({
    apiKey: "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", // Use .env for security
});

// API endpoint for ChatGPT responses
app.post("/api/chat", async (req, res) => {
    try {
        const { message } = req.body;

        const response = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [{ role: "user", content: message }],
        });

        res.json({ reply: response.choices[0].message.content });
    } catch (error) {
        console.error("ChatGPT API Error:", error);
        res.status(500).json({ error: "Failed to get a response from ChatGPT" });
    }
});

app.use((req, res, next) => {
    console.log(`${req.method} ${req.url}`);
    next();
});

// ✅ API route (MUST be BEFORE serving React)
app.get("/api", (req, res) => {
    res.json({ message: "Hello from Express API!" });
});

// ✅ Email sending route
app.post("/send-email", async (req, res) => {
    const { name, email, message } = req.body;

    console.log("Received email request:", { name, email, message });

    const transporter = nodemailer.createTransport({
        host: "mail.y219.com",
        port: 587,
        secure: false,
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS,
        },
    });

    const mailOptions = {
        from: "info@y219.com",
        to: "info@y219.com",
        subject: `Contact form submission from ${name}`,
        text: `Name: ${name}\nEmail: ${email}\nMessage: ${message}`,
    };

    const confirmationMailOptions = {
        from: "info@y219.com",
        to: email,
        subject: "We have received your message",
        text: `Dear ${name},\n\nThank you for reaching out to us. We have received your message and will get back to you shortly.\n\nBest regards,\nY219.com Team\n`,
    };

    try {
        await transporter.sendMail(mailOptions);
        await transporter.sendMail(confirmationMailOptions);
        console.log("Emails sent successfully");
        res.status(200).json({ message: "Emails sent successfully" });
    } catch (error) {
        console.error("Error sending emails:", error);
        res.status(500).json({ message: "Error sending emails" });
    }
});

// ✅ Serve React frontend
const clientBuildPath = path.join(__dirname, "client", "dist");
app.use(express.static(clientBuildPath));

// ✅ Catch-all: Send `index.html` for all non-API routes
app.get("*", (req, res) => {
    res.sendFile(path.join(clientBuildPath, "index.html"), (err) => {
        if (err) {
            res.status(500).send("Error loading frontend");
        }
    });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
