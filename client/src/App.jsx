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
import Payments from "./components/payments";
import POS from "./components/pos";
import Prom from "./components/prom";
import Terms from "./components/Terms";
import Privacy from "./components/Privacy";
import Clients from "./components/Clients";
import NotFoundPage from "./components/NotFoundPage";

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
                    <Route path="/payments" element={<Payments />} />  {/* Added Route */}
                    <Route path="/pos" element={<POS />} />  {/* Added Route */}
                    <Route path="/prom" element={<Prom />} />  {/* Added Route */}
                    <Route path="/terms" element={<Terms />} />  {/* Added Route */}
                    <Route path="/privacy" element={<Privacy />} />  {/* Added Route */}
                    <Route path="/clients" element={<Clients />} />  {/* Added Route */}
                    <Route path="*" element={<NotFoundPage />} />
                </Routes>
            </div>
        </Router>
    );
};

export default App;