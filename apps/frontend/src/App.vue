<script setup lang="ts">
import EndpointExplorer from './components/EndpointExplorer.vue';
</script>

<template>
  <div class="app">
    <header class="app__header">
      <h1>Modular API Explorer</h1>
      <p>
        Interact with the local NestJS backend. Configure the request and inspect the
        response payloads without affecting the backend development workflow.
      </p>
    </header>
    <main class="app__main">
      <EndpointExplorer />
    </main>
  </div>
</template>

<style scoped>
.app {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  padding: 1.5rem;
  gap: 2rem;
  background: radial-gradient(circle at top, #1f2937, #0b1120 70%);
  color: #f8fafc;
  font-family: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}

.app__header {
  max-width: 840px;
}

.app__header h1 {
  font-size: clamp(2rem, 3vw + 1rem, 3rem);
  margin-bottom: 0.5rem;
}

.app__header p {
  margin: 0;
  color: #cbd5f5;
}

.app__main {
  flex: 1;
  display: flex;
  justify-content: center;
}
</style>
