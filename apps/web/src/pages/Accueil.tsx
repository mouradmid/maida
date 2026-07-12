import { Link } from 'react-router-dom';

export function Accueil() {
  return (
    <div className="flex flex-col gap-4 items-center">
      <h1 className="text-2xl font-semibold">Maïda</h1>
      <p className="text-gray-600">Choisissez un espace (page de développement, temporaire) :</p>
      <div className="flex gap-4">
        <Link className="underline" to="/admin">
          Super-admin
        </Link>
        <Link className="underline" to="/gerant">
          Gérant
        </Link>
        <Link className="underline" to="/caisse">
          Caisse
        </Link>
      </div>
    </div>
  );
}
