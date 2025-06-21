import React, { useState } from "react";
import { Link } from "react-router-dom";
import "../styles/MenuBar.css";

const MenuBar = () => {
    const [menuOpen, setMenuOpen] = useState(false);

    const toggleMenu = () => {
        setMenuOpen(!menuOpen);
    };

    return (
        <nav className="menu-bar">
            <div className="menu-icon" onClick={toggleMenu}>
                &#9776;
            </div>
            <ul className={`menu-items ${menuOpen ? 'show' : ''}`}>
                <li><Link to="/">Home</Link></li>
                <li><Link to="/services">Services</Link></li>
                <li className="dropdown">
                    <Link to="">Accounting Software</Link>
                    <ul className="submenu">
                        <li><Link to="/accounting/odoo">Odoo</Link></li>
                        <li><Link to="/accounting/quickbooks">QuickBooks</Link></li>
                        <li><Link to="/accounting/gnucash">GNUcash</Link></li>
                        <li><Link to="/accounting/quicken">Quicken</Link></li>
                        <li><Link to="/accounting/chatclient">Ask a Question</Link></li>
                    </ul>
                </li>
                <li><Link to="/pricing">Pricing</Link></li>
                <li><Link to="/clients">Our Clients</Link></li>
                <li><Link to="/contact">Contact</Link></li>
            </ul>
        </nav>
    );
};

export default MenuBar;