import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, createHmac } from 'node:crypto';

@Injectable()
export class MinioStorageService {
   private readonly endpoint: URL;
   private readonly accessKey: string;
   private readonly secretKey: string;
   private readonly bucket: string;
   private readonly region: string;
   private bucketReady = false;

   constructor(config: ConfigService) {
      this.endpoint = new URL(config.get<string>('S3_ENDPOINT', 'http://localhost:9000'));
      this.accessKey = config.get<string>('S3_ACCESS_KEY', 'minioadmin');
      this.secretKey = config.get<string>('S3_SECRET_KEY', 'minioadmin123');
      this.bucket = config.get<string>('S3_BUCKET', 'flowie');
      this.region = config.get<string>('S3_REGION', 'us-east-1');
   }

   async put(key: string, body: Buffer): Promise<void> {
      await this.ensureBucket();
      const response = await this.request('PUT', `/${this.bucket}/${this.escapeKey(key)}`, body);
      if (!response.ok) throw new InternalServerErrorException('Could not store attachment.');
   }

   async get(key: string): Promise<Buffer> {
      const response = await this.request('GET', `/${this.bucket}/${this.escapeKey(key)}`);
      if (!response.ok) throw new InternalServerErrorException('Could not read attachment.');
      return Buffer.from(await response.arrayBuffer());
   }

   private async ensureBucket(): Promise<void> {
      if (this.bucketReady) return;
      const response = await this.request('PUT', `/${this.bucket}`);
      if (!response.ok && response.status !== 409) {
         throw new InternalServerErrorException('Could not prepare attachment storage.');
      }
      this.bucketReady = true;
   }

   private async request(method: 'GET' | 'PUT', path: string, body?: Buffer): Promise<Response> {
      const now = new Date();
      const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
      const date = amzDate.slice(0, 8);
      const payloadHash = this.hash(body ?? Buffer.alloc(0));
      const canonicalHeaders = `host:${this.endpoint.host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
      const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
      const canonicalRequest = `${method}\n${path}\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;
      const credentialScope = `${date}/${this.region}/s3/aws4_request`;
      const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${credentialScope}\n${this.hash(canonicalRequest)}`;
      const signingKey = this.signingKey(date);
      const signature = createHmac('sha256', signingKey).update(stringToSign).digest('hex');
      const authorization = `AWS4-HMAC-SHA256 Credential=${this.accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
      return fetch(new URL(path, this.endpoint).toString(), {
         method,
         headers: {
            authorization,
            'x-amz-content-sha256': payloadHash,
            'x-amz-date': amzDate,
         },
         body: body ? new Uint8Array(body) : undefined,
      });
   }

   private signingKey(date: string): Buffer {
      const dateKey = createHmac('sha256', `AWS4${this.secretKey}`).update(date).digest();
      const regionKey = createHmac('sha256', dateKey).update(this.region).digest();
      const serviceKey = createHmac('sha256', regionKey).update('s3').digest();
      return createHmac('sha256', serviceKey).update('aws4_request').digest();
   }

   private hash(value: string | Buffer): string {
      return createHash('sha256').update(value).digest('hex');
   }

   private escapeKey(key: string): string {
      return key.split('/').map(encodeURIComponent).join('/');
   }
}
