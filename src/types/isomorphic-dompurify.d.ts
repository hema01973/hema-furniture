// FIND-006 FIX: ambient declaration for isomorphic-dompurify.
// isomorphic-dompurify re-exports the DOMPurify API on both browser and server.
// @types/dompurify covers the browser type; this shim ensures the server-side
// module resolves to the same type so @ts-ignore is not needed anywhere.
declare module 'isomorphic-dompurify' {
  import DOMPurify from 'dompurify';
  export default DOMPurify;
  export * from 'dompurify';
}
