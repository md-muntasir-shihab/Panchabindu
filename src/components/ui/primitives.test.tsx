import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { Button, Input, Select } from './primitives';

test('input associates validation errors and existing descriptions', () => {
  const html = renderToStaticMarkup(<Input id="phone" label="Phone" error="Invalid phone" aria-describedby="phone-hint" />);
  assert.match(html, /aria-describedby="phone-hint phone-message"/);
  assert.match(html, /id="phone-message"[^>]*role="alert"/);
  assert.match(html, /aria-invalid="true"/);
  assert.match(html, /for="phone"/);
});

test('input associates helper text without marking a valid field invalid', () => {
  const html = renderToStaticMarkup(<Input id="name" helperText="Full name" />);
  assert.match(html, /aria-describedby="name-message"/);
  assert.match(html, /id="name-message"/);
  assert.match(html, /aria-invalid="false"/);
});

test('select associates errors with its control', () => {
  const html = renderToStaticMarkup(<Select id="district" label="District" options={[]} error="Choose a district" />);
  assert.match(html, /aria-describedby="district-message"/);
  assert.match(html, /id="district-message"[^>]*role="alert"/);
});

test('loading buttons are disabled, busy and retain a 44px touch target', () => {
  const html = renderToStaticMarkup(<Button size="sm" isLoading>Submit</Button>);
  assert.match(html, /disabled=""/);
  assert.match(html, /aria-busy="true"/);
  assert.match(html, /min-h-\[44px\]/);
});
