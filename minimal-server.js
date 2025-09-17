import express from 'express';
const app = express();
const PORT = process.env.PORT || 3000;

// Health check endpoint
app.get('/health', (req, res) => {
  console.log('Health check requested');
  res.status(200).send('ok');
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    port: PORT
  });
});

// Start server
console.log('Starting minimal server on port:', PORT);

app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Minimal server running on port ${PORT}`);
  console.log(`✅ Health check: http://0.0.0.0:${PORT}/health`);
});

// Error handling
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});
