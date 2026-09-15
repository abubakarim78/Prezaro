// Minimal ambient declaration for the vendored face-api.js IIFE bundle
// (loaded from /vendor/face-api.js at runtime, not bundled).
export {};

declare global {
  interface Window {
    faceapi?: {
      nets: {
        tinyFaceDetector: { loadFromUri: (u: string) => Promise<void>; isLoaded?: boolean }
        faceLandmark68Net: { loadFromUri: (u: string) => Promise<void>; isLoaded?: boolean }
        faceRecognitionNet: { loadFromUri: (u: string) => Promise<void>; isLoaded?: boolean }
      }
      /** tfjs is bundled inside @vladmandic/face-api and re-exported */
      tf?: {
        ready: () => Promise<void>
      }
      TinyFaceDetectorOptions: new (o: { inputSize: number; scoreThreshold: number }) => unknown
      detectSingleFace: (
        input: HTMLVideoElement | HTMLCanvasElement | HTMLImageElement,
        options: unknown
      ) => {
        withFaceLandmarks: () => {
          withFaceDescriptor: () => Promise<{
            detection: {
              box: { x: number; y: number; width: number; height: number }
              score: number
            }
            landmarks: {
              positions: { x: number; y: number }[]
              getNose: () => { x: number; y: number }[]
              getLeftEye: () => { x: number; y: number }[]
              getRightEye: () => { x: number; y: number }[]
            }
            descriptor: Float32Array
          } | undefined>
        }
      }
      detectAllFaces: (
        input: HTMLVideoElement | HTMLCanvasElement | HTMLImageElement,
        options: unknown
      ) => {
        withFaceLandmarks: () => {
          withFaceDescriptors: () => Promise<
            {
              detection: {
                box: { x: number; y: number; width: number; height: number }
                score: number
              }
              landmarks: {
                positions: { x: number; y: number }[]
                getNose: () => { x: number; y: number }[]
                getLeftEye: () => { x: number; y: number }[]
                getRightEye: () => { x: number; y: number }[]
              }
              descriptor: Float32Array
            }[]
          >
        }
      }
      euclideanDistance: (a: Float32Array | number[], b: Float32Array | number[]) => number
    }
  }
}
