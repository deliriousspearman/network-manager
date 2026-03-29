export default function LoadingSpinner({ message = 'Loading...' }: { message?: string }) {
  return (
    <div className="loading-spinner">
      <div className="spinner" />
      <span>{message}</span>
    </div>
  );
}
