const form = document.querySelector('#search-form');
const input = document.querySelector('#city-input');
const statusEl = document.querySelector('#status');
const historyPanel = document.querySelector('#history-panel');
const historyList = document.querySelector('#history-list');
const forecastEl = document.querySelector('#forecast');

const locationEl = document.querySelector('#location');
const summaryEl = document.querySelector('#summary');
const temperatureEl = document.querySelector('#temperature');
const feelsLikeEl = document.querySelector('#feels-like');
const humidityEl = document.querySelector('#humidity');
const windEl = document.querySelector('#wind');

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle('error', isError);
}

function formatDay(value) {
  return new Intl.DateTimeFormat('en', { weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(value));
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  })[char]);
}

function renderWeather(weather) {
  locationEl.textContent = weather.location.name;
  summaryEl.textContent = weather.current.summary;
  temperatureEl.textContent = weather.current.temperature;
  feelsLikeEl.innerHTML = `${weather.current.feelsLike}&deg;`;
  humidityEl.textContent = `${weather.current.humidity}%`;
  windEl.textContent = `${weather.current.wind} km/h`;

  forecastEl.innerHTML = weather.daily
    .map((day) => `
      <article class="forecast-card">
        <div>
          <span>${formatDay(day.date)}</span>
          <p class="condition">${escapeHtml(day.summary)}</p>
        </div>
        <strong>${day.max}&deg; / ${day.min}&deg;</strong>
        <span>${day.precipitation}% precipitation</span>
      </article>
    `)
    .join('');
}

function renderHistory(history = []) {
  historyPanel.classList.remove('hidden');

  if (!history.length) {
    historyList.innerHTML = '<p class="status">No previous searches yet.</p>';
    return;
  }

  historyList.innerHTML = history
    .map((item) => `
      <div class="history-item">
        <button class="history-search" type="button" data-city="${escapeHtml(item.query)}">
          <span>
            <strong>${escapeHtml(item.resolvedName)}</strong>
            <small>${new Date(item.searchedAt).toLocaleString()}</small>
          </span>
          <strong>${item.temperature}&deg;</strong>
        </button>
        <button class="history-delete" type="button" data-id="${escapeHtml(item.id)}" aria-label="Delete ${escapeHtml(item.resolvedName)} search">
          Delete
        </button>
      </div>
    `)
    .join('');
}

async function deleteSearch(id) {
  setStatus('Deleting search...');

  try {
    const response = await fetch(`/api/history/${id}`, { method: 'DELETE' });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Unable to delete search.');
    }

    renderHistory(data.history);
    setStatus('Search deleted.');
  } catch (error) {
    setStatus(error.message, true);
  }
}

async function searchWeather(city) {
  setStatus('Searching...');
  form.querySelector('button').disabled = true;

  try {
    const response = await fetch('/api/weather', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ city })
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Unable to search weather.');
    }

    renderWeather(data.weather);
    renderHistory(data.history);
    setStatus('Search saved to MongoDB.');
  } catch (error) {
    setStatus(error.message, true);
  } finally {
    form.querySelector('button').disabled = false;
  }
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const city = input.value.trim();
  if (city) {
    searchWeather(city);
  }
});

historyList.addEventListener('click', (event) => {
  const deleteButton = event.target.closest('.history-delete');
  if (deleteButton) {
    deleteSearch(deleteButton.dataset.id);
    return;
  }

  const button = event.target.closest('.history-search');
  if (!button) return;

  input.value = button.dataset.city;
  searchWeather(button.dataset.city);
});
