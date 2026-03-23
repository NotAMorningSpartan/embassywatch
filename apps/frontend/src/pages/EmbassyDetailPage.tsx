import { useParams } from "react-router-dom";

export default function EmbassyDetailPage() {
  const { id } = useParams<{ id: string }>();

  return (
    <>
      <h1>Embassy Detail</h1>
      <div className="ew-placeholder">
        Details for embassy <strong>{id}</strong> will appear here.
      </div>
    </>
  );
}
