import axios from "axios";
import { useNavigate, useParams } from "react-router-dom";

export default function DeleteTask() {
  const { id } = useParams();
  const navigate = useNavigate();

  const confirmDelete = async () => {
    await axios.delete(`${process.env.REACT_APP_API_URL || "https://to-do-final-appilication-1.onrender.com"}/tasks/${id}`);
    navigate("/dashboard");
  };

  return (
    <div className="page-center" style={{background: 'rgba(0,0,0,0.6)'}}> 
      {/* Dark overlay background for focus */}
      
      <div className="card" style={{textAlign: 'center', borderTop: '5px solid #ff7675'}}>
        <span className="warning-icon">⚠️</span>
        
        <h2 style={{color: '#2d3436', marginBottom: '10px'}}>Delete Task?</h2>
        
        <p style={{color: '#636e72', marginBottom: '30px'}}>
            Are you sure you want to remove this task? <br/>
            <strong>This action cannot be undone.</strong>
        </p>

        <div className="btn-group">
            <button className="btn-secondary" onClick={() => navigate("/dashboard")}>
                Cancel
            </button>
            <button className="btn-danger" onClick={confirmDelete}>
                Yes, Delete It
            </button>
        </div>
      </div>
    </div>
  );
}