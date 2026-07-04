import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import { MongoClient, ObjectId } from 'mongodb';

const app = express();
const port = Number(process.env.PORT || 3000);
const mongoUri = process.env.MONGODB_URI;
const mongoDbName = process.env.MONGODB_DB || 'weather_dashboard';

let searchesCollection;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const weatherCodeText = {
  0: 'Clear sky',
  1: 'Mainly clear',
  2: 'Partly cloudy',
  3: 'Overcast',
  45: 'Fog',
  48: 'Depositing rime fog',
  51: 'Light drizzle',
  53: 'Moderate drizzle',
  55: 'Dense drizzle',
  61: 'Slight rain',
  63: 'Moderate rain',
  65: 'Heavy rain',
  71: 'Slight snow',
  73: 'Moderate snow',
  75: 'Heavy snow',
  80: 'Rain showers',
  81: 'Moderate rain showers',
  82: 'Violent rain showers',
  95: 'Thunderstorm'
};

function requireMongo(_, res, next) {
  if (!searchesCollection) {
    return res.status(503).json({
      error: 'MongoDB is not connected. Set MONGODB_URI in .env and restart the server.'
    });
  }
  return next();
}

function formatPlace(place) {
  return [place.name, place.admin1, place.country].filter(Boolean).join(', ');
}

async function geocodeCity(city) {
  const url = new URL('https://geocoding-api.open-meteo.com/v1/search');
  url.searchParams.set('name', city);
  url.searchParams.set('count', '1');
  url.searchParams.set('language', 'en');
  url.searchParams.set('format', 'json');

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error('Could not reach the geocoding service.');
  }

  const data = await response.json();
  const place = data.results?.[0];
  if (!place) {
    const err = new Error('No matching city found.');
    err.status = 404;
    throw err;
  }

  return place;
}

async function getWeather(place) {
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', place.latitude);
  url.searchParams.set('longitude', place.longitude);
  url.searchParams.set('current', 'temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m');
  url.searchParams.set('daily', 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max');
  url.searchParams.set('timezone', 'auto');

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error('Could not reach the weather service.');
  }

  const data = await response.json();
  const daily = data.daily.time.map((day, index) => ({
    date: day,
    code: data.daily.weather_code[index],
    summary: weatherCodeText[data.daily.weather_code[index]] || 'Changing conditions',
    max: Math.round(data.daily.temperature_2m_max[index]),
    min: Math.round(data.daily.temperature_2m_min[index]),
    precipitation: data.daily.precipitation_probability_max[index] ?? 0
  }));

  return {
    location: {
      name: formatPlace(place),
      latitude: place.latitude,
      longitude: place.longitude,
      timezone: data.timezone
    },
    current: {
      time: data.current.time,
      temperature: Math.round(data.current.temperature_2m),
      feelsLike: Math.round(data.current.apparent_temperature),
      humidity: data.current.relative_humidity_2m,
      wind: Math.round(data.current.wind_speed_10m),
      code: data.current.weather_code,
      summary: weatherCodeText[data.current.weather_code] || 'Changing conditions'
    },
    daily
  };
}

async function getSearchHistory() {
  const history = await searchesCollection
    .find({})
    .sort({ searchedAt: -1 })
    .limit(12)
    .toArray();

  return history.map(({ _id, ...item }) => ({
    id: _id.toString(),
    ...item
  }));
}

app.get('/api/history', requireMongo, async (_, res) => {
  res.json({ history: await getSearchHistory() });
});

app.delete('/api/history/:id', requireMongo, async (req, res) => {
  if (!ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ error: 'Invalid search id.' });
  }

  const result = await searchesCollection.deleteOne({ _id: new ObjectId(req.params.id) });
  if (!result.deletedCount) {
    return res.status(404).json({ error: 'Search was not found.' });
  }

  res.json({ history: await getSearchHistory() });
});

app.post('/api/weather', requireMongo, async (req, res) => {
  const city = String(req.body.city || '').trim();
  if (!city) {
    return res.status(400).json({ error: 'Enter a city name.' });
  }

  try {
    const place = await geocodeCity(city);
    const weather = await getWeather(place);
    const search = {
      query: city,
      resolvedName: weather.location.name,
      latitude: weather.location.latitude,
      longitude: weather.location.longitude,
      summary: weather.current.summary,
      temperature: weather.current.temperature,
      searchedAt: new Date()
    };

    await searchesCollection.insertOne(search);

    res.json({ weather, history: await getSearchHistory() });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || 'Something went wrong.' });
  }
});

async function start() {
  if (!mongoUri) {
    console.warn('MONGODB_URI is not set. API requests will return a setup error.');
  } else {
    const client = new MongoClient(mongoUri);
    await client.connect();
    const db = client.db(mongoDbName);
    searchesCollection = db.collection('searches');
    await searchesCollection.createIndex({ searchedAt: -1 });
  }

  app.listen(port, () => {
    console.log(`Weather dashboard running at http://localhost:${port}`);
  });
}

start().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});

