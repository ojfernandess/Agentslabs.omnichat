import { Navigate } from 'react-router-dom';

/** Rota legacy — a app autenticada usa `/inbox`. */
const Index = () => <Navigate to="/inbox" replace />;

export default Index;
