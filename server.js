const express = require("express");
const path = require("path");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());

// ✅ API route (MUST be BEFORE serving React)
app.get("/api", (req, res) => {
    res.json({ message: "Hello from Express API!" });
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
