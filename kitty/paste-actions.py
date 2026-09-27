# A paste must NEVER press Enter. Pastes have auto-executed commands even at
# a ble.sh prompt with bracketed paste supposedly on, so don't trust terminal
# state at all: unconditionally join every pasted line with a space. Nothing
# pasted can ever act as Enter; you always review the line and press Enter
# yourself. Multi-line pastes (scripts, heredocs) arrive as one long line you
# re-split by hand -- that is the price of the guarantee.
def filter_paste(text: str) -> str:
    text = text.replace('\r\n', '\n').replace('\r', '\n')  # CRLF -> LF first (CR alone would be Enter)
    return text.replace('\n', ' ')
