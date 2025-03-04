import React from "react";
import MenuBar from "./MenuBar";
import ImageCarousel from "./ImageCarousel";
import "../styles/HomePage.css";

const HomePage = () => {
    return (
        <div className="home-container">
            <div className="header-text">
                <span className="large">Y</span><span className="small">219.com</span><br/>
                <span className="small">Quality, Affordable IT Services</span>
            </div>
            <MenuBar />
            <ImageCarousel />
            
            {/* Ensure there's space below the carousel */}
            <div className="spacer"></div>

            {/* Copyright Notice */}
            <footer className="copyright">
                © {new Date().getFullYear()} Y219.com. All Rights Reserved.
            </footer>
        </div>
    );
};

export default HomePage;
