import {describe,it,expect} from 'vitest';
import {videoOpenApi} from './videoApi.js';
describe('public video API contract',()=>{
  it('derives the request schema from the canonical video contract',()=>{const api=videoOpenApi();expect(api.openapi).toBe('3.1.0');expect(api.components.schemas.GenerateVideoInput.properties).toHaveProperty('scriptProvider');expect(api.components.schemas.GenerateVideoInput.properties).toHaveProperty('requestId');expect(api.paths).toHaveProperty('/videos/{jobId}');});
  it('separates hosted quota/signed-media behavior from local artifact downloads',()=>{expect(videoOpenApi('hosted').paths).toHaveProperty('/me');expect(videoOpenApi('hosted').paths).not.toHaveProperty('/videos/{jobId}/{kind}');expect(videoOpenApi('local').paths).toHaveProperty('/videos/{jobId}/{kind}');});
  it('excludes owner configuration mutations and secret-key schemas',()=>{const text=JSON.stringify(videoOpenApi());expect(text).not.toContain('/studio/keys');expect(text).not.toContain('ELEVENLABS_API_KEY');expect(text).not.toContain('GEMINI_API_KEY');expect(text).not.toContain('session.token');});
});
