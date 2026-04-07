import { getRiskLabel, getBadgeText } from './risk.js';

describe('getRiskLabel', () => {
  describe('SAFE range (0-29)', () => {
    test('returns SAFE label for score 0', () => {
      const result = getRiskLabel(0);
      expect(result.label).toBe('SAFE');
      expect(result.color).toBe('#00b894');
    });

    test('returns SAFE label for score 29', () => {
      const result = getRiskLabel(29);
      expect(result.label).toBe('SAFE');
      expect(result.color).toBe('#00b894');
    });
  });

  describe('CAUTION range (30-59)', () => {
    test('returns CAUTION label for score 30', () => {
      const result = getRiskLabel(30);
      expect(result.label).toBe('CAUTION');
      expect(result.color).toBe('#fdcb6e');
    });

    test('returns CAUTION label for score 59', () => {
      const result = getRiskLabel(59);
      expect(result.label).toBe('CAUTION');
      expect(result.color).toBe('#fdcb6e');
    });
  });

  describe('SUSPICIOUS range (60-79)', () => {
    test('returns SUSPICIOUS label for score 60', () => {
      const result = getRiskLabel(60);
      expect(result.label).toBe('SUSPICIOUS');
      expect(result.color).toBe('#e17055');
    });

    test('returns SUSPICIOUS label for score 79', () => {
      const result = getRiskLabel(79);
      expect(result.label).toBe('SUSPICIOUS');
      expect(result.color).toBe('#e17055');
    });
  });

  describe('DANGER range (80-100)', () => {
    test('returns DANGER label for score 80', () => {
      const result = getRiskLabel(80);
      expect(result.label).toBe('DANGER');
      expect(result.color).toBe('#d63031');
    });

    test('returns DANGER label for score 100', () => {
      const result = getRiskLabel(100);
      expect(result.label).toBe('DANGER');
      expect(result.color).toBe('#d63031');
    });
  });
});

describe('getBadgeText', () => {
  describe('SAFE range (0-29)', () => {
    test('returns ✓ for score 0', () => {
      expect(getBadgeText(0)).toBe('✓');
    });

    test('returns ✓ for score 29', () => {
      expect(getBadgeText(29)).toBe('✓');
    });
  });

  describe('CAUTION range (30-59)', () => {
    test('returns ! for score 30', () => {
      expect(getBadgeText(30)).toBe('!');
    });

    test('returns ! for score 59', () => {
      expect(getBadgeText(59)).toBe('!');
    });
  });

  describe('SUSPICIOUS range (60-79)', () => {
    test('returns !! for score 60', () => {
      expect(getBadgeText(60)).toBe('!!');
    });

    test('returns !! for score 79', () => {
      expect(getBadgeText(79)).toBe('!!');
    });
  });

  describe('DANGER range (80-100)', () => {
    test('returns ✕ for score 80', () => {
      expect(getBadgeText(80)).toBe('✕');
    });

    test('returns ✕ for score 100', () => {
      expect(getBadgeText(100)).toBe('✕');
    });
  });
});
