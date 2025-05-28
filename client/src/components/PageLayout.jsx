import React from "react";
import MenuBar from "./MenuBar";
import "../styles/PageLayout.css";

const PageLayout = ({ children }) => {
    return (
        <div className="page-container border-lines">
            {/* Header */}
            <div className="header-text">
                <span className="large">Y</span><span className="small">219.com</span><br/>
                <span className="small">Quality, Affordable IT Services</span>
            </div>

            {/* Menu Bar */}
            <MenuBar />

            {/* Content Below Menu */}
            <div className="page-content">
                {children} {/* Dynamic content for each page */}
            </div>
            <div>
                {/* Footer */}
<footer className="copyright">
    <div className="footer-links">
        <a href="/terms">Terms Of Use</a>
        <span className="footer-separator">|</span>
        <a href="/privacy">Privacy & Cookies</a>
    </div>
    <div>
        © {new Date().getFullYear()} Y219.com. All Rights Reserved.
    </div>
</footer>
                <br/>
           </div>
        </div>
        
        
    );
};

export default PageLayout;
