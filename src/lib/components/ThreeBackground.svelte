<script lang="ts">
    import { T } from '@threlte/core';
    import * as THREE from 'three';
    import { onMount } from 'svelte';

    let particles: THREE.Points;
    let positions: Float32Array;

    onMount(() => {
        const particleCount = 5000;
        positions = new Float32Array(particleCount * 3);

        for (let i = 0; i < particleCount; i++) {
            const i3 = i * 3;
            positions[i3] = (Math.random() - 0.5) * 15; // x
            positions[i3 + 1] = (Math.random() - 0.5) * 15; // y
            positions[i3 + 2] = (Math.random() - 0.5) * 15; // z
        }
    });

    function onFrame({ delta }: { delta: number }) {
        if (particles) {
            particles.rotation.y += delta * 0.05;
        }
    }
</script>

<div class="canvas-container">
    <T.Canvas>
        <T.PerspectiveCamera makeDefault position={[0, 0, 5]} />
        {#if positions}
            <T.Points bind:ref={particles}>
                <T.BufferGeometry>
                    <T.BufferAttribute
                        attach="attributes.position"
                        array={positions}
                        count={positions.length / 3}
                        itemSize={3}
                    />
                </T.BufferGeometry>
                <T.PointsMaterial color="#f72585" size={0.015} />
            </T.Points>
        {/if}
        <T.Loop onFrame={onFrame} />
    </T.Canvas>
</div>

<style>
    .canvas-container {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        z-index: -1;
    }
</style>