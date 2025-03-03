import React, { useState, useEffect } from "react";
import MenuBar from "./MenuBar";
import "../styles/HomePage.css";

const HomePage = () => {
    const [isMobile, setIsMobile] = useState(window.innerWidth <= 600);

    useEffect(() => {
        const handleResize = () => {
            setIsMobile(window.innerWidth <= 600);
        };
        window.addEventListener("resize", handleResize);
        return () => window.removeEventListener("resize", handleResize);
    }, []);

    return (
        <div className="home-container">
            <div className="header-text">
                <span className="large">Y</span><span className="small">219.com</span>
                {isMobile ? <br /> : <span className="line-break"> - </span>}
                <span className="small">Quality, Affordable IT Services</span>
            </div>
            <MenuBar />
        </div>
    );
};

export default HomePage;
