from PIL import Image

# 1. Open the image and ensure it's in RGBA mode
img = Image.open('jobsystems.png').convert("RGBA")

# 2. Get the pixel data safely
datas = img.getdata()

new_data = []

# 3. Loop through every pixel (R, G, B, A)
for item in datas:
    # If the pixel is pure black (like the outer corners outside the rounded square)
    if item[0] == 0 and item[1] == 0 and item[2] == 0:
        # Change alpha channel to 0 (Transparent)
        new_data.append((0, 0, 0, 0))
    else:
        # Keep the original pixel color
        new_data.append(item)

# 4. Apply the modified data back to the image and save
img.putdata(new_data)
img.save("jobsystems_transparent.png", "PNG")

print("Image processed and saved successfully!")
