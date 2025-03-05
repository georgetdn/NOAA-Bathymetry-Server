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
                <li><Link to="/contact">Contact</Link></li>
                <li><Link to="/login">Login</Link></li>
            </ul>
        </nav>
    );
};

export default MenuBar;