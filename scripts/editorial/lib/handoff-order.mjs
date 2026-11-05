export async function completeEditorialAfterCheckpoint({save, verify, finish}) {
  const checkpoint = await save();
  if (!checkpoint?.saved) throw new Error('Editorial checkpoint was not saved');
  await verify(checkpoint);
  return {checkpoint, finished: await finish()};
}
