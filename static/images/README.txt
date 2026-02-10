IMAGES FOLDER
==============

PUT YOUR LOGO AND IMAGES HERE

Instructions:
-------------
1. Copy your Logo.png file here
2. Copy any other images you need
3. The Flask app expects:
   - static/images/Logo.png (your main logo)

File path in HTML: 
{{ url_for('static', filename='images/Logo.png') }}

All images go in this folder!
