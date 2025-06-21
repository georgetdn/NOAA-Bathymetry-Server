import React from "react";
import MenuBar from "./MenuBar";
import "../styles/PageLayout.css";

const PageLayout = ({ children }) => {
    return (
        <div className="page-container border-lines">
            {/* Header */}
            <div className="header-text">
                <span className="large">Y</span><span className="small">219.com</span><br />
                <span className="small">Quality, Affordable IT Services</span>
            </div>

            {/* Menu Bar */}
            <MenuBar />
            <br/><br/> 
            {/* New Three-Column Layout */}
            <div className="three-column-layout">
                <div className="side-column"></div>

                <div className="center-column">
                    {children}
                </div>

                <div className="side-column"></div>
            </div>
            <br/><br/> <br/> 
            {/* Footer */}
            <footer className="copyright">
                <div className="footer-links">
                    <a href="/terms">Terms Of Use</a>
                    <span className="footer-separator">|</span>
                    <a href="/privacy">Privacy & Cookies</a>
                </div>
                <div>© {new Date().getFullYear()} Y219.com. All Rights Reserved.</div>
            </footer>
        </div>
    );
};

export default PageLayout;
