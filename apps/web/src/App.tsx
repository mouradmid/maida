import { Route, Routes } from 'react-router-dom';
import { Accueil } from './pages/Accueil';
import { EspaceSuperAdmin } from './pages/EspaceSuperAdmin';
import { EspaceGerant } from './pages/EspaceGerant';
import { EspaceCaisse } from './pages/EspaceCaisse';

function App() {
  return (
    <main className="min-h-screen flex items-center justify-center p-8">
      <Routes>
        <Route path="/" element={<Accueil />} />
        <Route path="/admin" element={<EspaceSuperAdmin />} />
        <Route path="/gerant" element={<EspaceGerant />} />
        <Route path="/caisse" element={<EspaceCaisse />} />
      </Routes>
    </main>
  );
}

export default App;
