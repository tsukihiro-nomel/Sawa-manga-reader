import { describe, expect, it, vi } from 'vitest';
import {
  buildRetriedMediaSrc,
  createMediaFailureState,
  createMediaAssetIdentity,
  mediaFailureReducer,
  retryFailedPdfAsset
} from '../src/components/MediaAsset.jsx';

describe('media retry behavior', () => {
  it('changes an image URL on every retry so the browser performs a new request', () => {
    expect(buildRetriedMediaSrc('manga://local/cover.jpg', 0)).toBe('manga://local/cover.jpg');
    expect(buildRetriedMediaSrc('manga://local/cover.jpg', 2)).toBe('manga://local/cover.jpg?sawaRetry=2');
    expect(buildRetriedMediaSrc('manga://local/cover.jpg?thumbnail=1', 3))
      .toBe('manga://local/cover.jpg?thumbnail=1&sawaRetry=3');
  });

  it('clears the PDF failure and advances the attempt after invalidating its cache', () => {
    const setFailure = vi.fn();
    const setAttempt = vi.fn();

    retryFailedPdfAsset('C:\\library\\chapter.pdf', setFailure, setAttempt);

    expect(setFailure).toHaveBeenCalledWith(null);
    expect(setAttempt).toHaveBeenCalledOnce();
    expect(setAttempt.mock.calls[0][0](4)).toBe(5);
  });

  it('gives a failed old asset and a succeeding replacement distinct reset identities', () => {
    const failedIdentity = createMediaAssetIdentity({
      src: 'manga://local/old.jpg',
      filePath: 'C:\\library\\old.jpg',
      pageNumber: 1
    });
    const succeedingIdentity = createMediaAssetIdentity({
      src: 'manga://local/new.jpg',
      filePath: 'C:\\library\\new.jpg',
      pageNumber: 1
    });

    let state = createMediaFailureState(failedIdentity);
    state = mediaFailureReducer(state, { type: 'failed', error: new Error('old file failed') });
    state = mediaFailureReducer(state, { type: 'toggle-details' });
    state = mediaFailureReducer(state, { type: 'retry' });
    state = mediaFailureReducer(state, { type: 'failed', error: new Error('old retry failed') });
    expect(state).toMatchObject({
      identity: failedIdentity,
      attempt: 1,
      showDetails: true
    });

    state = mediaFailureReducer(state, { type: 'identity', identity: succeedingIdentity });
    state = mediaFailureReducer(state, { type: 'succeeded' });

    expect(succeedingIdentity).not.toBe(failedIdentity);
    expect(state).toEqual({
      identity: succeedingIdentity,
      failure: null,
      attempt: 0,
      showDetails: false
    });
    expect(createMediaAssetIdentity({
      src: 'manga://local/new.jpg',
      filePath: 'C:\\library\\new.jpg',
      pageNumber: 1
    })).toBe(succeedingIdentity);
  });
});
