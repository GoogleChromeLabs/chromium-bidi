# Copyright 2025 Google LLC.
# Copyright (c) Microsoft Corporation.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

import pytest
from test_helpers import execute_command, goto_url


async def verify_field_value(websocket, context_id, field_id, expected_value):
    """Helper function to verify that a form field has the expected value."""
    resp = await execute_command(
        websocket, {
            'method': 'script.evaluate',
            'params': {
                'expression': f'document.getElementById("{field_id}").value',
                'target': {
                    'context': context_id
                },
                'awaitPromise': False
            }
        })
    assert resp['result']['value'] == expected_value, f"Field '{field_id}' expected '{expected_value}' but got '{resp['result']['value']}'"


@pytest.mark.asyncio
async def test_autofill_trigger_with_card(websocket, context_id, html):
    """Test autofill.trigger command with credit card data."""
    # Create a simple form with credit card fields
    await goto_url(
        websocket, context_id,
        html('''
            <form>
                <input type="text" id="cardNumber" name="cardNumber" placeholder="Card Number">
                <input type="text" id="cardName" name="cardName" placeholder="Cardholder Name">
                <input type="text" id="expiryMonth" name="expiryMonth" placeholder="MM">
                <input type="text" id="expiryYear" name="expiryYear" placeholder="YYYY">
                <input type="text" id="cvc" name="cvc" placeholder="CVC">
            </form>
        ''')
    )

    # Get a reference to the card number input field
    resp = await execute_command(
        websocket, {
            'method': 'script.evaluate',
            'params': {
                'expression': 'document.getElementById("cardNumber")',
                'target': {
                    'context': context_id
                },
                'awaitPromise': False
            }
        })

    element_shared_id = resp['result']['sharedId']

    # Execute autofill.trigger with card data
    card_data = {
        'number': '4111111111111111',
        'name': 'John Doe',
        'expiryMonth': '12',
        'expiryYear': '2025',
        'cvc': '123'
    }

    resp = await execute_command(
        websocket, {
            'method': 'autofill.trigger',
            'params': {
                'context': context_id,
                'element': {
                    'sharedId': element_shared_id
                },
                'card': card_data
            }
        })

    # The command should return an empty result
    assert resp == {}

    # Verify that the form fields were actually filled with the card data
    await verify_field_value(websocket, context_id, "cardNumber", "4111111111111111")
    await verify_field_value(websocket, context_id, "cardName", "John Doe")
    await verify_field_value(websocket, context_id, "expiryMonth", "12")
    await verify_field_value(websocket, context_id, "expiryYear", "2025")
    await verify_field_value(websocket, context_id, "cvc", "123")


@pytest.mark.asyncio
async def test_autofill_trigger_with_address(websocket, context_id, html):
    """Test autofill.trigger command with address data."""
    # Create a simple form with address fields
    await goto_url(
        websocket, context_id,
        html('''
            <form>
                <input type="text" id="firstName" name="firstName" placeholder="First Name">
                <input type="text" id="lastName" name="lastName" placeholder="Last Name">
                <input type="text" id="street" name="street" placeholder="Street Address">
                <input type="text" id="city" name="city" placeholder="City">
                <input type="text" id="state" name="state" placeholder="State">
                <input type="text" id="zipCode" name="zipCode" placeholder="ZIP Code">
            </form>
        ''')
    )

    # Get a reference to the first name input field
    resp = await execute_command(
        websocket, {
            'method': 'script.evaluate',
            'params': {
                'expression': 'document.getElementById("firstName")',
                'target': {
                    'context': context_id
                },
                'awaitPromise': False
            }
        })

    element_shared_id = resp['result']['sharedId']

    # Execute autofill.trigger with address data
    address_data = {
        'fields': [
            {'name': 'NAME_FIRST', 'value': 'Jane'},
            {'name': 'NAME_LAST', 'value': 'Smith'},
            {'name': 'ADDRESS_HOME_LINE1', 'value': '123 Main St'},
            {'name': 'ADDRESS_HOME_CITY', 'value': 'Anytown'},
            {'name': 'ADDRESS_HOME_STATE', 'value': 'CA'},
            {'name': 'ADDRESS_HOME_ZIP', 'value': '12345'}
        ]
    }

    resp = await execute_command(
        websocket, {
            'method': 'autofill.trigger',
            'params': {
                'context': context_id,
                'element': {
                    'sharedId': element_shared_id
                },
                'address': address_data
            }
        })

    # The command should return an empty result
    assert resp == {}

    # Verify that the address form fields were actually filled
    await verify_field_value(websocket, context_id, "firstName", "Jane")
    await verify_field_value(websocket, context_id, "lastName", "Smith")
    await verify_field_value(websocket, context_id, "street", "123 Main St")
    await verify_field_value(websocket, context_id, "city", "Anytown")
    await verify_field_value(websocket, context_id, "state", "CA")
    await verify_field_value(websocket, context_id, "zipCode", "12345")


@pytest.mark.asyncio
async def test_autofill_trigger_with_both_card_and_address(websocket, context_id, html):
    """Test autofill.trigger command with both card and address data."""
    # Create a comprehensive form
    await goto_url(
        websocket, context_id,
        html('''
            <form>
                <!-- Card fields -->
                <input type="text" id="cardNumber" name="cardNumber" placeholder="Card Number">
                <input type="text" id="cardName" name="cardName" placeholder="Cardholder Name">
                <input type="text" id="expiryMonth" name="expiryMonth" placeholder="MM">
                <input type="text" id="expiryYear" name="expiryYear" placeholder="YYYY">
                <input type="text" id="cvc" name="cvc" placeholder="CVC">

                <!-- Address fields -->
                <input type="text" id="firstName" name="firstName" placeholder="First Name">
                <input type="text" id="lastName" name="lastName" placeholder="Last Name">
                <input type="text" id="street" name="street" placeholder="Street Address">
                <input type="text" id="city" name="city" placeholder="City">
                <input type="text" id="state" name="state" placeholder="State">
                <input type="text" id="zipCode" name="zipCode" placeholder="ZIP Code">
            </form>
        ''')
    )

    # Get a reference to the card number input field
    resp = await execute_command(
        websocket, {
            'method': 'script.evaluate',
            'params': {
                'expression': 'document.getElementById("cardNumber")',
                'target': {
                    'context': context_id
                },
                'awaitPromise': False
            }
        })

    element_shared_id = resp['result']['sharedId']

    # Execute autofill.trigger with both card and address data
    card_data = {
        'number': '4111111111111111',
        'name': 'John Doe',
        'expiryMonth': '12',
        'expiryYear': '2025',
        'cvc': '123'
    }

    address_data = {
        'fields': [
            {'name': 'firstName', 'value': 'John'},
            {'name': 'lastName', 'value': 'Doe'},
            {'name': 'street', 'value': '456 Oak Ave'},
            {'name': 'city', 'value': 'Springfield'},
            {'name': 'state', 'value': 'IL'},
            {'name': 'zipCode', 'value': '62701'}
        ]
    }

    # The command should fail with an error about unsupported field type
    with pytest.raises(Exception) as exc_info:
        await execute_command(
            websocket, {
                'method': 'autofill.trigger',
                'params': {
                    'context': context_id,
                    'element': {
                        'sharedId': element_shared_id
                    },
                    'card': card_data,
                    'address': address_data
                }
            })

    # Verify that the error is about unsupported field type
    error = exc_info.value.args[0]
    assert error['error'] == 'unknown error'
    assert 'Card and address cannot both be provided' in error['message']

@pytest.mark.asyncio
async def test_autofill_trigger_no_card_or_address(websocket, context_id, html):
    """Test autofill.trigger command with minimal parameters (no card or address data)."""
    # Create a simple input field
    await goto_url(
        websocket, context_id,
        html('<input type="text" id="testField" name="testField" placeholder="Test Field">')
    )

    # Get a reference to the input field
    resp = await execute_command(
        websocket, {
            'method': 'script.evaluate',
            'params': {
                'expression': 'document.getElementById("testField")',
                'target': {
                    'context': context_id
                },
                'awaitPromise': False
            }
        })

    element_shared_id = resp['result']['sharedId']

    with pytest.raises(Exception) as exc_info:
        await execute_command(
            websocket, {
                'method': 'autofill.trigger',
                'params': {
                    'context': context_id,
                    'element': {
                        'sharedId': element_shared_id
                    },
                }
            })

    # Verify that the error is about unsupported field type
    error = exc_info.value.args[0]
    assert error['error'] == 'unknown error'
    assert 'Either card or address must be provided' in error['message']


@pytest.mark.asyncio
async def test_autofill_trigger_invalid_element(websocket, context_id, html):
    """Test autofill.trigger command with invalid element reference."""
    # Create a simple page
    await goto_url(websocket, context_id, html('<div>Test page</div>'))

    # Try to execute autofill.trigger with an invalid shared ID
    with pytest.raises(Exception) as exc_info:
        await execute_command(
            websocket, {
                'method': 'autofill.trigger',
                'params': {
                    'context': context_id,
                    'element': {
                        'sharedId': 'invalid-shared-id'
                    },
                    'card': {
                        'number': '4111111111111111',
                        'name': 'Test User',
                        'expiryMonth': '12',
                        'expiryYear': '2025',
                        'cvc': '123'
                    }
                }
            })
    error = exc_info.value.args[0]
    assert error['error'] == 'no such node'
    assert 'SharedId "invalid-shared-id" was not found' in error['message']


@pytest.mark.asyncio
async def test_autofill_trigger_unknown_field_type_error(websocket, context_id, html):
    """Test that autofill.trigger command fails with unknown field types."""
    # Create a form with various field types
    await goto_url(
        websocket, context_id,
        html('''
            <form>
                <input type="email" id="email" name="email" placeholder="Email">
                <input type="tel" id="phone" name="phone" placeholder="Phone">
                <input type="text" id="company" name="company" placeholder="Company">
                <select id="country" name="country">
                    <option value="">Select Country</option>
                    <option value="US">United States</option>
                    <option value="CA">Canada</option>
                </select>
                <textarea id="notes" name="notes" placeholder="Notes"></textarea>
            </form>
        ''')
    )

    # Test with email field
    resp = await execute_command(
        websocket, {
            'method': 'script.evaluate',
            'params': {
                'expression': 'document.getElementById("email")',
                'target': {
                    'context': context_id
                },
                'awaitPromise': False
            }
        })

    element_shared_id = resp['result']['sharedId']

    address_data = {
        'fields': [
            {'name': 'EMAIL_ADDRESS', 'value': 'test@example.com'},
            {'name': 'COMPANY_NAME', 'value': 'Test Company'},
            {'name': 'ADDRESS_HOME_COUNTRY', 'value': 'US'},
            {'name': 'UNKNOWN_TYPE', 'value': 'This is a test note'}
        ]
    }

    # The command should fail with an error about unsupported field type
    with pytest.raises(Exception) as exc_info:
        await execute_command(
            websocket, {
                'method': 'autofill.trigger',
                'params': {
                    'context': context_id,
                    'element': {
                        'sharedId': element_shared_id
                    },
                    'address': address_data
                }
            })

    # Verify that the error is about unsupported field type
    error = exc_info.value.args[0]
    assert error['error'] == 'unknown error'
    assert 'Unsupported field type' in error['message']
