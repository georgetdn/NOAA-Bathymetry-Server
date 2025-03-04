import React from "react";
import { Link } from "react-router-dom";
import "../styles/MenuBar.css";

const MenuBar = () => {
    return (
        <nav className="menu-bar">
            <ul className="center">
                <li><Link to="/">Home</Link></li>
                <li><Link to="/services">Services</Link></li>
                <li><Link to="/contact">Contact</Link></li>
                <li><Link to="/login">Login</Link></li>
            </ul>
        </nav>
    );
};

export default MenuBar;
