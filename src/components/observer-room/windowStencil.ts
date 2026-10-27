import * as THREE from "three";

// Keep all outdoor geometry behind the actual opening, including on tall screens.
export const exteriorStencil = { stencilWrite: true, stencilRef: 1, stencilFunc: THREE.EqualStencilFunc };
