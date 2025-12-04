/* eslint-env jest */
jest.mock('@react-native-async-storage/async-storage', () => ({
  setItem: jest.fn(() => Promise.resolve()),
  getItem: jest.fn(() => Promise.resolve(null)),
  removeItem: jest.fn(() => Promise.resolve()),
  clear: jest.fn(() => Promise.resolve()),
}));

jest.mock('react-native-linear-gradient', () => 'LinearGradient');
jest.mock('react-native-vector-icons/Feather', () => 'Icon');
jest.mock('react-native-chart-kit', () => ({
  LineChart: 'LineChart',
}));
jest.mock('react-native-share', () => ({
  open: jest.fn(() => Promise.resolve()),
}));
jest.mock('react-native-fs', () => ({
  DocumentDirectoryPath: '/mock/path',
  writeFile: jest.fn(() => Promise.resolve()),
}));
