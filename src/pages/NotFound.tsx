import { Link } from 'react-router-dom';
import { Container } from '../components/ui';

export default function NotFound() {
  return (
    <Container className="py-44 text-center">
      <div className="font-display text-7xl font-bold text-acc">404</div>
      <h1 className="mt-4 text-2xl font-bold">This page is in the shade.</h1>
      <p className="mt-2 text-ink-2">The page you are looking for does not exist.</p>
      <Link to="/" className="btn btn--primary mt-8">
        Back to sunlight
      </Link>
    </Container>
  );
}
