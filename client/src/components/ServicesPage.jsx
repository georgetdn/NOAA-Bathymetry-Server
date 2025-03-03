import React from "react";
import MenuBar from "./MenuBar";
import "../styles/HomePage.css";

const ServicesPage = () => {
    return (
        <div className="home-container">
            <div className="header-text">
                <span className="large">Y</span><span className="small">219.com</span>
                <span className="line-break"> <br /> </span>
                <span className="small">Our Services</span>
            </div>
            <MenuBar />
        </div>
    );
};

export default ServicesPage;
