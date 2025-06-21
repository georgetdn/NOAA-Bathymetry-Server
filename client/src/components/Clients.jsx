import React from "react";
import PageLayout from "./PageLayout";

const Clients = () => {
    return (
        <PageLayout>
            <h1>What Our Clients Are Saying</h1>
            <br/>
        <div> 
           At Y219.com, client satisfaction is the foundation of our success. We’re proud to serve individuals and businesses with reliable, expert-driven IT services — from software development to tech support and cybersecurity. Our mission is to simplify technology and provide lasting solutions tailored to your unique needs.
</div>
<div className ="services-content">
<br/>⭐⭐⭐⭐⭐<br/>
“George designed and installed our website, <a href = "https://estatesale21.com">estatesale21.com</a> in just a few days.  He setup the Stripe paiments. We have only to load our inventory (he trained us), and we were ready for business in less then a week. It was very nice working with him."
<br/>— Ana Long, Jacksonville Florida, <br/>
<br/>⭐⭐⭐⭐⭐<br/>
“Y219 set up our entire office network in one day and provided training to our staff — everything runs so smoothly now. Excellent service!”
— David L., Fairfax, VA<br/>

⭐⭐⭐⭐⭐
“As a nonprofit, we were truly fortunate to have George volunteer his time and talent to build our website. He delivered a beautiful, professional site that perfectly represents our mission — and at no cost to us, other than hosting. His generosity and skill made a big difference, and we couldn’t be more grateful.”
<br/><a href = "https://pharm.websample219.com/">PahrmRecycle</a><br/>

<br/>⭐⭐⭐⭐⭐<br/>
“These folks are pros. I was locked out of a cloud system, and they resolved it remotely in 15 minutes. Very responsive and trustworthy.”
<br/>— Ahmed R., Arlington, VA<br/>

<br/>⭐⭐⭐⭐⭐<br/>
“Their website development team created a clean, responsive site for our nonprofit. Great communication and even better results.”
<br/>— Julia K., Washington, D.C.<br/>
</div>
        </PageLayout>
    );
};

export default Clients;