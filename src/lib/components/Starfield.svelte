<script lang="ts">
	// This component uses pure CSS to create a lightweight, animated starfield.
</script>

<div class="stars">
	<div id="stars1"></div>
	<div id="stars2"></div>
	<div id="stars3"></div>
</div>

<style>
	@keyframes move-stars {
		from {
			transform: translateY(0px);
		}
		to {
			transform: translateY(-2000px);
		}
	}

	.stars {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		width: 100%;
		height: 100%;
		display: block;
		z-index: 0;
	}

	.stars > div {
		background: transparent;
		/* Create multiple layers of stars with different sizes */
		background-image: radial-gradient(white, rgba(255, 255, 255, 0.2)),
			radial-gradient(white, rgba(255, 255, 255, 0.1)),
			radial-gradient(rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0));
		background-repeat: repeat;
		background-position: 50% 50%;
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		will-change: transform;
	}

	#stars1 {
		animation: move-stars 200s linear infinite;
		background-size: 1px 1px, 2px 2px, 3px 3px;
	}

	#stars2 {
		animation: move-stars 150s linear infinite;
		background-size: 2px 2px, 3px 3px, 4px 4px;
	}

	#stars3 {
		animation: move-stars 100s linear infinite;
		background-size: 3px 3px, 4px 4px, 5px 5px;
	}
</style>