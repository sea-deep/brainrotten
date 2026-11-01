import {afterEach,beforeEach,describe,it,expect,vi} from 'vitest';
import {renderHook,act,waitFor} from '@testing-library/react';
import {emptyVideoReview,ReviewConflictError} from '@brainrot/contracts';
import {getVideoReview,saveVideoReview} from './api.js';
import {useVideoReview} from './useVideoReview.js';
vi.mock('./api.js',()=>({getVideoReview:vi.fn(),saveVideoReview:vi.fn()}));
const id='11111111-1111-4111-8111-111111111111';
beforeEach(()=>{vi.resetAllMocks();vi.mocked(getVideoReview).mockImplementation(async jobId=>emptyVideoReview(jobId));});
afterEach(()=>vi.restoreAllMocks());
describe('review synchronization in the player',()=>{
  it('retries a bookmark at the fresh version without overwriting a concurrent answer',async()=>{const fresh={...emptyVideoReview(id),version:1,answers:{key:{choice:0,correct:true,attempts:1,answeredAt:'2026-10-29T00:00:00.000Z'}}};vi.mocked(saveVideoReview).mockRejectedValueOnce(new ReviewConflictError(fresh)).mockResolvedValueOnce({...fresh,version:2,bookmarked:true});const {result}=renderHook(()=>useVideoReview(id,()=>{}));await waitFor(()=>expect(result.current.review?.version).toBe(0));await act(()=>result.current.save({kind:'bookmark',value:true}));expect(saveVideoReview).toHaveBeenLastCalledWith(id,{kind:'bookmark',expectedVersion:1,value:true});expect(result.current.review).toMatchObject({bookmarked:true,answers:fresh.answers});});
  it('does not double-count an answer when the first save succeeded but the response was lost',async()=>{const existing={...emptyVideoReview(id),version:1,answers:{key:{choice:0,correct:true,attempts:1,answeredAt:'2026-10-29T00:00:00.000Z'}}};vi.mocked(saveVideoReview).mockRejectedValueOnce(new ReviewConflictError(existing));const {result}=renderHook(()=>useVideoReview(id,()=>{}));await waitFor(()=>expect(result.current.review).not.toBeNull());await act(()=>result.current.save({kind:'answer',questionId:'key',choice:0}));expect(saveVideoReview).toHaveBeenCalledTimes(1);expect(result.current.review?.answers['key']?.attempts).toBe(1);});
});
