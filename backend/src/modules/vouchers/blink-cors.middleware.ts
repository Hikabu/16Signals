import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class BlinkCorsMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    // res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('X-Action-Version', '1');
    res.setHeader('X-Blockchain-Ids', 'solana:mainnet-beta');

    if (req.method === 'OPTIONS') {
      res.status(200).end();
      return;
    }
    next();
  }
}
