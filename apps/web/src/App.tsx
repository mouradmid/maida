import { Route, Routes } from 'react-router-dom';
import { Accueil } from './pages/Accueil';
import { EspaceSuperAdmin } from './pages/EspaceSuperAdmin';
import { EspaceGerant } from './pages/EspaceGerant';
import { EspaceCaisse } from './pages/EspaceCaisse';
import { MenuPublic } from './pages/MenuPublic';

function App() {
  return (
    <Routes>
      <Route path="/" element={<Accueil />} />
      <Route path="/admin" element={<EspaceSuperAdmin />} />
      <Route path="/gerant" element={<EspaceGerant />} />
      <Route path="/caisse" element={<EspaceCaisse />} />
      <Route path="/menu/:etablissementId" element={<MenuPublic />} />
    </Routes>
  );
}

export default App;
