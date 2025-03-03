import React, { useEffect } from "react";
import "../styles/MenuBar.css";

const MenuBar = () => {
    useEffect(() => {
        console.log("✅ MenuBar component loaded!");
    }, []);

    return (
        <nav className="menu-bar">
            <div className="center">
                <span>Home</span>
                <span>Services</span>
                <span>Contact</span>
                <span>Login</span>
            </div>
        </nav>
    );
};

export default MenuBar;
