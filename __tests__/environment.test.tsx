import { render } from '@testing-library/react-native';
import { HomePaymentCard } from '../components/HomePaymentCard';

// Environment smoke: proves jest-expo + RNTL + the asset pipeline work before
// the real ports lean on them. Delete freely if it ever gets in the way.
test('RNTL environment renders a real component with a local asset', async () => {
  const { getByLabelText } = await render(<HomePaymentCard />);
  expect(getByLabelText('Shop now. Pay later with Tabby and Tamara.')).toBeTruthy();
});
