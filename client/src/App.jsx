import React from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import HomePage from "./components/HomePage";
import ServicesPage from "./components/ServicesPage";
import LoginPage from "./components/LoginPage";
import ContactPage from "./components/ContactPage";
import MenuBar from "./components/MenuBar";

const App = () => {
    return (
        <Router>
            <div>
                <MenuBar /> {/* Menu stays visible on all pages */}
                <Routes>
                    <Route path="/" element={<HomePage />} />
                    <Route path="/services" element={<ServicesPage />} />
                    <Route path="/login" element={<LoginPage />} />
                    <Route path="/contact" element={<ContactPage />} />
                </Routes>
            </div>
        </Router>
    );
};

export default App;
    