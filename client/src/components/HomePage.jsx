import React from "react";
import MenuBar from "./MenuBar";
import ImageCarousel from "./ImageCarousel";
import "../styles/HomePage.css";  // Import the override styles
const HomePage = () => {
    return (
        <div className="home-container">
            <div className="header-text">
                <span className="large">Y</span><span className="small">219.com</span><br/>
                <span className="small">Quality, Affordable IT Services</span>
            </div>
            <MenuBar />
            
            {/* Main Content */}
            <div className="content">
                <ImageCarousel />
            </div>

            {/* Footer */}
            <footer className="copyright">
                © {new Date().getFullYear()} Y219.com. All Rights Reserved.
            </footer>
        </div>
    );
};

export default HomePage;

