export default function NotFoundPage() {
  return (
    <div style={{ padding: '3rem', textAlign: 'center' }}>
       <br/><br/><br/><br/>
       <img
        src="/images/beaverNews.png" // replace with your image path
        alt="Page Not Found"
        style={{
          maxWidth: '300px',
          margin: '0 auto',
          display: 'block',
        }}
      />
      <h1>Cranky! This page is missing!</h1>
    </div>
  );
}
