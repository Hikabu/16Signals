import { SignalExtractorService } from '../signal-extractor.service';
import {
  ALEX_BACKEND,
  SARAH_FULLSTACK,
  MAYA_DEVOPS,
  NEW_DEV,
  GHOST_PROFILE,
} from '../__fixtures__/seed-developers';

describe('Signal Extraction Integration (Checkpoint A)', () => {
  let service: SignalExtractorService;

  beforeEach(() => {
    service = new SignalExtractorService();
  });

  describe('CHECKPOINT A1, alex-backend', () => {
    it('should extract correct signals for a senior backend developer', () => {
      const signals = service.extract(ALEX_BACKEND);

      expect(signals.ownershipDepth).toBe(5);
      expect(signals.projectLongevity).toBeGreaterThanOrEqual(12.0);
      expect(signals.projectLongevity).toBeLessThanOrEqual(20.0);
      expect(signals.activityConsistency).toBeCloseTo(0.865, 3);
      expect(signals.techStackBreadth).toBe(3); // Go, Python, Shell
      expect(signals.externalContributions).toBe(12);
      expect(signals.projectMeaningfulness).toBeGreaterThan(0);
      // S7 Identity: Go(2), Python(2). Ties: Go, Python.
      expect(signals.stackIdentity).toEqual(['Go', 'Python']);
      expect(signals.dataCompleteness).toBeGreaterThanOrEqual(0.5);
      expect(signals.dataCompleteness).toBeLessThanOrEqual(0.7);
      expect(service.detectPrivateWorkIndicators(signals)).toBe(false);
    });
  });

  describe('CHECKPOINT A2, sarah-fullstack', () => {
    it('should extract correct signals for a fullstack developer', () => {
      const signals = service.extract(SARAH_FULLSTACK);

      expect(signals.ownershipDepth).toBe(4);
      expect(signals.stackIdentity[0]).toBe('TypeScript');
      expect(signals.dataCompleteness).toBeGreaterThanOrEqual(0.4);
      expect(signals.dataCompleteness).toBeLessThanOrEqual(0.6);
    });
  });

  describe('CHECKPOINT A3, maya-devops', () => {
    it('should detect private work indicators for a sparse profile', () => {
      const signals = service.extract(MAYA_DEVOPS);

      expect(signals.ownershipDepth).toBe(2);
      expect(signals.activityConsistency).toBeCloseTo(0.769, 3);
      // Alphabetical tie-break: HCL vs Shell
      expect(signals.stackIdentity).toEqual(['HCL', 'Shell']);
      expect(signals.dataCompleteness).toBeLessThanOrEqual(0.4);
      expect(service.detectPrivateWorkIndicators(signals)).toBe(true);
    });
  });

  describe('CHECKPOINT A4, new-dev', () => {
    it('should handle small datasets and young accounts correctly', () => {
      const signals = service.extract(NEW_DEV);

      expect(signals.ownershipDepth).toBe(0); // non-fork was created 2 months ago (< 90 days)
      expect(signals.activityConsistency).toBeCloseTo(0.288, 3);
      expect(signals.dataCompleteness).toBeLessThanOrEqual(0.4);
    });
  });

  describe('CHECKPOINT A5, ghost-profile', () => {
    it('should handle empty profiles with minimal noise', () => {
      const signals = service.extract(GHOST_PROFILE);

      expect(signals.ownershipDepth).toBe(0);
      expect(signals.activityConsistency).toBeCloseTo(0.038, 3);
      expect(signals.dataCompleteness).toBeLessThanOrEqual(0.3);
    });
  });
});
