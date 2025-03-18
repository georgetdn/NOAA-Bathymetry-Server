import React from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import HomePage from "./components/HomePage";
import ServicesPage from "./components/ServicesPage";
import PricingPage from "./components/PricingPage";
import ContactPage from "./components/ContactPage";
import MenuBar from "./components/MenuBar";
import Odoo from "./components/Odoo";
import QuickBooks from "./components/QuickBooks";
import GNUcash from "./components/GNUcash";
import Quicken from "./components/Quicken";
import ChatClient from "./components/ChatClient";

const App = () => {
    return (
        <Router>
            <div>
                <MenuBar /> {/* Menu stays visible on all pages */}
                <Routes>
                    <Route path="/" element={<HomePage />} />
                    <Route path="/services" element={<ServicesPage />} />
                    <Route path="/pricing" element={<PricingPage />} />
                    <Route path="/contact" element={<ContactPage />} />
                    <Route path="/accounting/odoo" element={<Odoo />} />
                    <Route path="/accounting/quickbooks" element={<QuickBooks />} />
                    <Route path="/accounting/gnucash" element={<GNUcash />} />
                    <Route path="/accounting/quicken" element={<Quicken />} />
                    <Route path="/accounting/chatclient" element={<ChatClient />} />
                </Routes>
            </div>
        </Router>
    );
};

export default App;