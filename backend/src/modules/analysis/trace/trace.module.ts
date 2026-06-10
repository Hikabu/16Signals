/**
 * TraceModule — NestJS module for decision-trace infrastructure.
 *
 * Provides TraceRecorderFactoryService under token TRACE_RECORDER_FACTORY.
 * Modules inject via @Optional() — zero impact if this module is not imported.
 *
 * Usage:
 *   // In analysis-v2.module.ts or test module:
 *   @Module({
 *     imports: [TraceModule.forRoot({ verbosity: 'decision' })],
 *     providers: [...],
 *   })
 *   export class AnalysisV2Module {}
 *
 *   // Option A: Global registration (for production debugging)
 *   @Module({
 *     imports: [TraceModule.forRoot({ verbosity: 'decision', isGlobal: true })],
 *   })
 *
 *   // Option B: Per-request (for targeted debug)
 *   // Pass verbosity via request context — TraceRecorderFactory.create(verbosity)
 *   // supports per-instance override.
 */
import { Module, DynamicModule, Global } from '@nestjs/common';
import { TraceRecorderFactoryService, TRACE_RECORDER_FACTORY } from './trace-recorder.service';
import { TraceVerbosity } from './trace-recorder.interface';

export interface TraceModuleOptions {
  verbosity?: TraceVerbosity;
  isGlobal?: boolean;
}

@Module({})
export class TraceModule {
  static forRoot(options: TraceModuleOptions = {}): DynamicModule {
    const verbosity = options.verbosity ?? 'decision';
    const providers = [
      {
        provide: TRACE_RECORDER_FACTORY,
        useFactory: () => new TraceRecorderFactoryService(verbosity),
      },
    ];

    return {
      global: options.isGlobal ?? false,
      module: TraceModule,
      providers,
      exports: [TRACE_RECORDER_FACTORY],
    };
  }

  /**
   * Simplified default registration for testing or simple setups.
   * Default verbosity: 'decision'.
   */
  static forTest(): DynamicModule {
    return TraceModule.forRoot({ verbosity: 'full' });
  }
}
